INSERT OR IGNORE INTO customers(id,name,code) VALUES (1,'Bank Arunika','ARN'),(2,'Bank Nawasena','NWS'),(3,'Bank Cakrawala','CKR');
INSERT OR IGNORE INTO remotes(id,customer_id,site_id,location,address,city,province,jarkom,ip_lan,pic_name,pic_phone) VALUES
(1,1,'ARN-001','ATM Minimarket Melati','Jl. Simulasi Melati No. 1','Mojokerto','Jawa Timur','VSAT','192.0.2.10','Bapak Andi (Dummy)','080000000001'),
(2,1,'ARN-002','ATM Pasar Cempaka','Jl. Simulasi Cempaka No. 2','Surabaya','Jawa Timur','M2M','192.0.2.11','Ibu Sari (Dummy)','080000000002'),
(3,2,'NWS-001','ATM Plaza Anggrek','Jl. Simulasi Anggrek No. 3','Bekasi','Jawa Barat','VSAT','198.51.100.10','Bapak Budi (Dummy)','080000000003'),
(4,2,'NWS-002','ATM Sentra Kenanga','Jl. Simulasi Kenanga No. 4','Bogor','Jawa Barat','M2M','198.51.100.11','Ibu Rina (Dummy)','080000000004'),
(5,3,'CKR-001','ATM Terminal Sakura','Jl. Simulasi Sakura No. 5','Semarang','Jawa Tengah','VSAT','203.0.113.10','Bapak Dedi (Dummy)','080000000005'),
(6,3,'CKR-002','ATM Gedung Teratai','Jl. Simulasi Teratai No. 6','Jakarta Selatan','DKI Jakarta','M2M','203.0.113.11','Ibu Maya (Dummy)','080000000006');
