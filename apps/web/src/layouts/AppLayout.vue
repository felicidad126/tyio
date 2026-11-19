<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { canOpen } from '../navigation';
import ForbiddenNotice from '../pages/forbidden/ForbiddenNotice.vue';
import { useSessionStore } from '../stores/session';
import SideNav from './SideNav.vue';
import TopBar from './TopBar.vue';

// Kerangka setelah login: menu samping, bilah atas, dan isi halaman (mockup Main.dc.html).
const route = useRoute();
const session = useSessionStore();
const content = useTemplateRef<HTMLElement>('content');

const allowed = computed(
  () => !!session.user && canOpen({ roles: route.meta.roles }, session.user.role),
);

// Setelah pindah halaman, fokus ke isi agar pembaca layar mulai dari judul halaman baru.
watch(
  () => route.path,
  async (_path, previous) => {
    if (previous === undefined) return;
    await nextTick();
    content.value?.focus({ preventScroll: true });
  },
);
</script>

<template>
  <div
    v-if="session.user"
    class="shell"
  >
    <a
      class="skip-link"
      href="#konten"
    >Lewati ke konten</a>
    <SideNav
      class="shell__side"
      :user="session.user"
    />
    <div class="shell__main">
      <TopBar />
      <main
        id="konten"
        ref="content"
        class="shell__content"
        tabindex="-1"
      >
        <RouterView v-if="allowed" />
        <ForbiddenNotice v-else />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100dvh;
}

.shell__side {
  flex: 0 0 232px;
}

.shell__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.shell__content {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 24px 24px 40px;
}

.shell__content:focus {
  outline: none;
}

.skip-link {
  position: absolute;
  top: -80px;
  left: 12px;
  z-index: 1030;
  padding: 10px 16px;
  border-radius: var(--tblr-border-radius);
  background: var(--tblr-bg-surface);
  color: var(--tblr-primary);
  font-weight: 600;
  box-shadow: var(--tblr-box-shadow-dropdown);
}

.skip-link:focus {
  top: 12px;
}

/* Di bawah 900px menu samping menjadi bilah mendatar di atas (mockup). */
@media (max-width: 900px) {
  .shell {
    flex-direction: column;
  }

  .shell__side {
    flex: 0 0 auto;
  }

  .shell__content {
    padding: 16px 16px 32px;
  }
}
</style>
