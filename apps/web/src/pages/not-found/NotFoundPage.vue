<template>
  <main class="not-found">
    <h1 class="not-found__title">
      Halaman tidak ditemukan
    </h1>
    <p>Alamat ini belum ada atau sudah dipindah.</p>
    <RouterLink to="/">Kembali ke halaman utama</RouterLink>
  </main>
</template>

<style scoped>
.not-found {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}

.not-found__title {
  margin: 0 0 8px;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}

.not-found a {
  color: var(--c-primary);
}
</style>
