<script setup lang="ts">
import {
  type CustomerRecord,
  isMasterKind,
  MASTER_KIND_LABELS,
  MASTER_KINDS_WITH_CODE,
  type MasterKind,
  type TenantSummary,
} from '@tyio/shared';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../../../components/PageHeader.vue';
import { useSessionStore } from '../../../stores/session';
import MasterTable, { type MasterRow } from './MasterTable.vue';
import { errorText, masterApi } from './master-api';

// Data master (langkah 1.1): kategori, system, dan jarkom per customer, serta daftar
// customer. Nilai yang sudah dipakai tidak bisa dihapus, hanya dinonaktifkan.

type Tab = MasterKind | 'customer';

const TABS: ReadonlyArray<{ key: Tab; label: string; noun: string; help: string }> = [
  {
    key: 'kategori',
    label: MASTER_KIND_LABELS.kategori,
    noun: 'kategori',
    help: 'Jenis kejadian di tiket, mis. Remote Down, Corrective, Preventive.',
  },
  {
    key: 'system',
    label: MASTER_KIND_LABELS.system,
    noun: 'system',
    help: 'Alat monitoring sumber gangguan, mis. SNMP NOC atau NMS VSAT.',
  },
  {
    key: 'jarkom',
    label: MASTER_KIND_LABELS.jarkom,
    noun: 'jarkom',
    help: 'Jenis jaringan komputer remote. Kodenya masuk ke nomor NPR/TT dan tidak bisa diubah.',
  },
  {
    key: 'customer',
    label: 'Customer',
    noun: 'customer',
    help: 'Bank pengguna layanan. Kodenya masuk ke nomor NPR/TT dan tidak bisa diubah.',
  },
];

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const tab = computed<Tab>(() => {
  const value = route.params.jenis;
  return value === 'customer' || isMasterKind(value) ? value : 'kategori';
});
const tabInfo = computed(() => TABS.find((item) => item.key === tab.value) ?? TABS[0]!);
const withCode = computed(() => tab.value === 'customer' || MASTER_KINDS_WITH_CODE.includes(tab.value));
/** Daftar customer hanya diubah admin semua customer; nilai master oleh admin mana pun. */
const canEdit = computed(() => tab.value !== 'customer' || session.user?.allTenants === true);

const customers = ref<TenantSummary[]>([]);
const customerId = computed(() => {
  const fromQuery = route.query.customer;
  const chosen = customers.value.find((customer) => customer.id === fromQuery);
  return (chosen ?? customers.value[0])?.id;
});
const customerName = computed(() => customers.value.find((c) => c.id === customerId.value)?.name ?? '');

const rows = ref<MasterRow[]>([]);
const loading = ref(true);
const loadError = ref('');

const newName = ref('');
const newCode = ref('');
const formError = ref('');
const saving = ref(false);
const notice = ref('');

async function loadCustomers(): Promise<void> {
  customers.value = await masterApi.activeCustomers();
}

async function loadRows(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    if (tab.value === 'customer') {
      rows.value = (await masterApi.listCustomers()).map(fromCustomer);
    } else if (customerId.value) {
      rows.value = await masterApi.listValues(tab.value, customerId.value);
    } else {
      rows.value = [];
    }
  } catch (error) {
    rows.value = [];
    loadError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}

// Daftar customer dimuat sekali dulu, baru isi tab; setelah itu isi dimuat ulang setiap
// tab atau customer berganti.
const ready = loadCustomers().catch((error: unknown) => {
  loadError.value = errorText(error);
});

watch(
  [tab, customerId],
  async ([nextTab], previous) => {
    await ready;
    // Di tab Customer, pilihan customer tidak dipakai; pesan "ditambahkan" tetap tampil.
    if (nextTab !== 'customer' || previous?.[0] !== 'customer') notice.value = '';
    formError.value = '';
    await loadRows();
  },
  { immediate: true },
);

function selectCustomer(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  void router.replace({ query: { ...route.query, customer: id } });
}

function fromCustomer(customer: CustomerRecord): MasterRow {
  return { id: customer.id, name: customer.name, code: customer.code, active: customer.active };
}

async function add(): Promise<void> {
  saving.value = true;
  formError.value = '';
  notice.value = '';
  try {
    const name = newName.value;
    if (tab.value === 'customer') {
      await masterApi.createCustomer({ code: newCode.value, name });
      await loadCustomers();
    } else {
      if (!customerId.value) return;
      await masterApi.createValue(tab.value, {
        tenantId: customerId.value,
        name,
        ...(withCode.value ? { code: newCode.value } : {}),
      });
    }
    notice.value = `${tabInfo.value.label} "${name.trim()}" ditambahkan.`;
    newName.value = '';
    newCode.value = '';
    await loadRows();
  } catch (error) {
    formError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

async function afterChange(message: string): Promise<void> {
  notice.value = message;
  formError.value = '';
  if (tab.value === 'customer') await loadCustomers();
  await loadRows();
}

const rename = async (row: MasterRow, name: string) => {
  if (tab.value === 'customer') await masterApi.updateCustomer(row.id, { name });
  else await masterApi.updateValue(tab.value, row.id, { name });
  await afterChange(`Nama "${row.name}" diganti menjadi "${name.trim()}".`);
};

const setActive = async (row: MasterRow, active: boolean) => {
  if (tab.value === 'customer') await masterApi.updateCustomer(row.id, { active });
  else await masterApi.updateValue(tab.value, row.id, { active });
  await afterChange(`"${row.name}" ${active ? 'diaktifkan' : 'dinonaktifkan'}.`);
};

const remove = async (row: MasterRow) => {
  if (tab.value === 'customer') await masterApi.deleteCustomer(row.id);
  else await masterApi.deleteValue(tab.value, row.id);
  await afterChange(`"${row.name}" dihapus.`);
};

const deactivateWarning = computed(() =>
  tab.value === 'customer'
    ? (row: MasterRow) =>
        `Nonaktifkan ${row.name}? Customer ini hilang dari pilihan, dan pengguna yang hanya ` +
        'dibatasi ke customer ini tidak bisa melihat datanya lagi. Data lama tetap tersimpan.'
    : undefined,
);

const emptyText = computed(() =>
  tab.value === 'customer'
    ? 'Belum ada customer.'
    : `Belum ada ${tabInfo.value.noun} untuk ${customerName.value}. Tambahkan lewat formulir di atas.`,
);
</script>

<template>
  <div>
    <PageHeader
      title="Data master"
      subtitle="Pilihan yang dipakai remote dan tiket. Nilai yang sudah dipakai tidak bisa dihapus; nonaktifkan agar tidak ditawarkan lagi."
    >
      <template #pretitle>
        <RouterLink to="/admin">
          Admin
        </RouterLink>
      </template>
    </PageHeader>

    <nav
      class="mb-3"
      aria-label="Jenis data master"
    >
      <ul class="nav nav-pills gap-1 flex-wrap">
        <li
          v-for="item in TABS"
          :key="item.key"
          class="nav-item"
        >
          <RouterLink
            class="nav-link"
            :class="{ active: item.key === tab }"
            :aria-current="item.key === tab ? 'page' : undefined"
            :to="{ name: 'admin-master', params: { jenis: item.key }, query: route.query.customer ? { customer: route.query.customer } : {} }"
          >
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <div class="card">
      <div class="card-header flex-wrap gap-3">
        <div class="me-auto">
          <h2 class="card-title">
            {{ tabInfo.label }}
          </h2>
          <p class="text-secondary small mb-0">
            {{ tabInfo.help }}
          </p>
        </div>
        <div
          v-if="tab !== 'customer'"
          class="customer-pick"
        >
          <label
            class="form-label mb-1"
            for="pilih-customer"
          >Customer</label>
          <select
            id="pilih-customer"
            class="form-select"
            :value="customerId"
            :disabled="customers.length === 0"
            @change="selectCustomer"
          >
            <option
              v-for="customer in customers"
              :key="customer.id"
              :value="customer.id"
            >
              {{ customer.name }} ({{ customer.code }})
            </option>
          </select>
        </div>
      </div>

      <div
        v-if="canEdit && (tab === 'customer' || customerId)"
        class="card-body border-bottom"
      >
        <form
          class="add-form"
          @submit.prevent="add"
        >
          <div
            v-if="withCode"
            class="add-form__code"
          >
            <label
              class="form-label"
              for="kode-baru"
            >Kode</label>
            <input
              id="kode-baru"
              v-model="newCode"
              class="form-control text-uppercase font-monospace"
              maxlength="10"
              autocomplete="off"
              aria-describedby="kode-baru-bantuan"
              required
            >
            <div
              id="kode-baru-bantuan"
              class="form-hint"
            >
              2–10 huruf atau angka
            </div>
          </div>
          <div class="add-form__name">
            <label
              class="form-label"
              for="nama-baru"
            >Nama</label>
            <input
              id="nama-baru"
              v-model="newName"
              class="form-control"
              maxlength="80"
              autocomplete="off"
              required
            >
          </div>
          <div class="add-form__submit">
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="saving"
            >
              Tambah {{ tabInfo.noun }}
            </button>
          </div>
        </form>
        <div
          v-if="formError"
          class="text-danger mt-2"
          role="alert"
        >
          {{ formError }}
        </div>
      </div>
      <div
        v-else-if="tab === 'customer'"
        class="card-body border-bottom text-secondary"
      >
        Daftar customer hanya bisa diubah admin yang mengelola semua customer.
      </div>

      <!-- Selalu ada agar pembaca layar mengumumkan pesan yang baru masuk. -->
      <div
        role="status"
        :class="notice ? 'card-body py-2 text-success border-bottom' : ''"
      >
        {{ notice }}
      </div>

      <div
        v-if="loadError"
        class="card-body text-danger"
        role="alert"
      >
        {{ loadError }}
      </div>
      <div
        v-else-if="tab !== 'customer' && !loading && customers.length === 0"
        class="card-body text-secondary"
      >
        Belum ada customer aktif. Tambahkan customer dulu di tab Customer.
      </div>
      <div
        v-else-if="!loading && rows.length === 0"
        class="card-body text-secondary"
      >
        {{ emptyText }}
      </div>
      <MasterTable
        v-else-if="rows.length > 0"
        :rows="rows"
        :noun="tabInfo.noun"
        :show-code="withCode"
        :code-first="tab === 'customer'"
        :can-edit="canEdit"
        :deactivate-warning="deactivateWarning"
        :rename="rename"
        :set-active="setActive"
        :remove="remove"
      />
    </div>
  </div>
</template>

<style scoped>
.customer-pick {
  min-width: 240px;
}

.add-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
}

.add-form__code {
  width: 160px;
}

.add-form__name {
  flex: 1 1 240px;
}

/* Tombol sejajar dengan kotak isian (di bawah label). */
.add-form__submit {
  padding-top: calc(1.25rem + 0.5rem);
}

@media (max-width: 575.98px) {
  .customer-pick,
  .add-form__code,
  .add-form__name,
  .add-form__submit,
  .add-form__submit .btn {
    width: 100%;
  }

  .add-form__submit {
    padding-top: 0;
  }

  .add-form__submit .btn {
    min-height: 44px;
  }
}
</style>
