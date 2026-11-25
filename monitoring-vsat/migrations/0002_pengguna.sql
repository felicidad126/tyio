-- Akun per orang: peran (admin/helpdesk), status aktif, dan pencatat data
-- disimpan sebagai id pengguna, bukan teks nama.

ALTER TABLE users ADD COLUMN peran TEXT NOT NULL DEFAULT 'helpdesk' CHECK (peran IN ('admin', 'helpdesk'));
ALTER TABLE users ADD COLUMN aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1));

-- Akun yang sudah ada sebelum migrasi ini adalah pemilik aplikasi, jadi
-- dijadikan admin supaya tetap bisa mengelola pengguna.
UPDATE users SET peran = 'admin';

-- Nama pencatat lama yang tidak cocok dengan akun mana pun disimpan sebagai
-- akun arsip yang nonaktif. Password '!' tidak akan pernah cocok dengan hash
-- mana pun, jadi akun ini tidak bisa dipakai login.
INSERT INTO users (username, full_name, password_hash, password_salt, peran, aktif)
SELECT 'arsip-' || lower(hex(randomblob(4))), nama, '!', '!', 'helpdesk', 0
FROM (
  SELECT created_by AS nama FROM nprs
  UNION SELECT created_by FROM actions
  UNION SELECT created_by FROM gamas
  UNION SELECT created_by FROM gamas_actions
)
WHERE nama NOT IN (SELECT full_name FROM users);

ALTER TABLE nprs ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE actions ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE gamas ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE gamas_actions ADD COLUMN user_id INTEGER REFERENCES users(id);

UPDATE nprs SET user_id = (SELECT id FROM users WHERE users.full_name = nprs.created_by ORDER BY id LIMIT 1);
UPDATE actions SET user_id = (SELECT id FROM users WHERE users.full_name = actions.created_by ORDER BY id LIMIT 1);
UPDATE gamas SET user_id = (SELECT id FROM users WHERE users.full_name = gamas.created_by ORDER BY id LIMIT 1);
UPDATE gamas_actions SET user_id = (SELECT id FROM users WHERE users.full_name = gamas_actions.created_by ORDER BY id LIMIT 1);

ALTER TABLE nprs DROP COLUMN created_by;
ALTER TABLE actions DROP COLUMN created_by;
ALTER TABLE gamas DROP COLUMN created_by;
ALTER TABLE gamas_actions DROP COLUMN created_by;
