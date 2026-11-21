<script setup lang="ts">
import type { RemoteDetail } from '@tyio/shared';

// Data lokasi, jaringan, dan kontak remote, hanya-baca (langkah 1.3: "terisi otomatis dan
// hanya-baca"). Data remote diubah admin lewat impor, bukan dari tiket.

defineProps<{ remote: RemoteDetail }>();

const OFFSET = { WIB: 'UTC+7', WITA: 'UTC+8', WIT: 'UTC+9' } as const;
const dash = (value: string | null | undefined) => (value ? value : '—');
const join = (values: Array<string | null>, separator: string) => values.filter(Boolean).join(separator) || '—';
</script>

<template>
  <div class="facts">
    <section aria-labelledby="fakta-lokasi">
      <h3
        id="fakta-lokasi"
        class="facts__title"
      >
        Lokasi
      </h3>
      <dl class="datagrid">
        <div class="datagrid-item">
          <dt class="datagrid-title">
            Alamat
          </dt>
          <dd class="datagrid-content">
            {{ dash(remote.address) }}
          </dd>
        </div>
        <div class="datagrid-item">
          <dt class="datagrid-title">
            Kota / Provinsi
          </dt>
          <dd class="datagrid-content">
            {{ join([remote.city, remote.province], ', ') }}
          </dd>
        </div>
        <div class="datagrid-item">
          <dt class="datagrid-title">
            Zona waktu
          </dt>
          <dd class="datagrid-content">
            {{ remote.zone }} ({{ OFFSET[remote.zone] }})
          </dd>
        </div>
        <div class="datagrid-item">
          <dt class="datagrid-title">
            Kanwil / Kanca
          </dt>
          <dd class="datagrid-content">
            {{ join([remote.kanwil, remote.kanca], ' / ') }}
          </dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="fakta-jaringan">
      <h3
        id="fakta-jaringan"
        class="facts__title"
      >
        Jaringan
      </h3>
      <dl class="datagrid">
        <div class="datagrid-item">
          <dt class="datagrid-title">
            Jarkom
          </dt>
          <dd class="datagrid-content">
            {{ remote.networkName }} ({{ remote.networkCode }})
          </dd>
        </div>
        <div class="datagrid-item">
          <dt class="datagrid-title">
            IP SNMP
          </dt>
          <dd class="datagrid-content font-monospace">
            {{ dash(remote.ipSnmp) }}
          </dd>
        </div>
        <div class="datagrid-item">
          <dt class="datagrid-title">
            IP LAN
          </dt>
          <dd class="datagrid-content font-monospace">
            {{ dash(remote.ipLan) }}
          </dd>
        </div>
        <div class="datagrid-item">
          <dt class="datagrid-title">
            User IP / User ID
          </dt>
          <dd class="datagrid-content font-monospace">
            {{ join([remote.userIp, remote.userIdent], ' / ') }}
          </dd>
        </div>
        <div class="datagrid-item">
          <dt class="datagrid-title">
            Pengelola
          </dt>
          <dd class="datagrid-content">
            {{ dash(remote.manager) }}
          </dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="fakta-kontak">
      <h3
        id="fakta-kontak"
        class="facts__title"
      >
        Kontak di lokasi
      </h3>
      <ul
        v-if="remote.contacts.length > 0"
        class="facts__contacts"
      >
        <li
          v-for="(contact, index) in remote.contacts"
          :key="index"
        >
          <strong>{{ contact.name }}</strong>
          <span
            v-if="contact.role"
            class="text-secondary"
          > · {{ contact.role }}</span>
          <a
            v-if="contact.phone"
            :href="`tel:${contact.phone.replace(/[^\d+]/g, '')}`"
            class="d-block"
          >{{ contact.phone }}</a>
        </li>
      </ul>
      <p
        v-else
        class="text-secondary m-0"
      >
        Belum ada kontak.
      </p>
    </section>
  </div>
</template>

<style scoped>
.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.facts__title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}

.datagrid,
.datagrid dd {
  margin: 0;
}

.datagrid {
  --tblr-datagrid-item-width: 100%;
}

.facts__contacts {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.facts__contacts a {
  min-height: 32px;
  line-height: 32px;
}

@media (max-width: 991.98px) {
  .facts {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 575.98px) {
  .facts__contacts a {
    min-height: 44px;
    line-height: 44px;
  }
}
</style>
