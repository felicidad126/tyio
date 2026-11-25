<template>
  <!-- Logo PT. Tangara Mitrakom (T165) di kotak putih, agar tetap jelas di sidebar gelap dan
       tema gelap. Sama dengan ikon aplikasi dan favicon (public/). -->
  <span
    class="app-logo"
    aria-hidden="true"
  >
    <img
      src="/logo-tm.png"
      alt=""
      width="256"
      height="256"
    >
  </span>
</template>

<style scoped>
.app-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.app-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
