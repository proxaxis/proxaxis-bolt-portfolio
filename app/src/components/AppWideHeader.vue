<script setup>
import { onBeforeUnmount, onMounted, ref, computed } from 'vue';
import { applyTheme, getCurrentTheme, watchSystemTheme } from '@/lib/theme';
import IconMoon from '@/components/icons/IconMoon.vue';
import IconSun from '@/components/icons/IconSun.vue';
import IconBoxOpen from '@/components/icons/IconBoxOpen.vue';
import IconHouse from '@/components/icons/IconHouse.vue';
import IconNewspaper from '@/components/icons/IconNewspaper.vue';
import IconScrewdriverWrench from '@/components/icons/IconScrewdriverWrench.vue';
import IconCommentDots from '@/components/icons/IconCommentDots.vue';

const props = defineProps({
  activeIndex: {
    type: Number,
    default: 0,
  },
  currentPath: {
    type: String,
    default: '/',
  },
});

const theme = ref('light');
const isHeaderVisible = ref(true);
const lastScrollY = ref(0);
let unwatchSystemTheme = null;

const themeIconComponent = computed(() => (theme.value === 'light' ? IconMoon : IconSun));

function changeTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light';
  applyTheme(theme.value);
}

function handleScroll() {
  const currentScrollY = window.scrollY;

  if (currentScrollY < 50) {
    isHeaderVisible.value = true;
    lastScrollY.value = currentScrollY;
    return;
  }

  isHeaderVisible.value = currentScrollY <= lastScrollY.value;
  lastScrollY.value = currentScrollY;
}

function handleNav(event, path) {
  if (path === props.currentPath) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

onMounted(() => {
  theme.value = getCurrentTheme();
  unwatchSystemTheme = watchSystemTheme((next) => {
    theme.value = next;
    applyTheme(next);
  });
  window.addEventListener('scroll', handleScroll);
});

onBeforeUnmount(() => {
  unwatchSystemTheme?.();
  window.removeEventListener('scroll', handleScroll);
});
</script>

<template>
  <header class="app-wide-header" :class="{ 'is-hidden': !isHeaderVisible }">
    <a class="logo" href="/" @click="handleNav($event, '/')">PORTFOLIO</a>

    <nav>
      <ul>
        <li :class="{ active: props.activeIndex === 0 }">
          <a href="/" @click="handleNav($event, '/')">
            <IconHouse size="1.85rem" />
            <span>HOME</span>
          </a>
        </li>
        <li :class="{ active: props.activeIndex === 1 }">
          <a href="/products" @click="handleNav($event, '/products')">
            <IconBoxOpen size="1.85rem" />
            <span>WORKS</span>
          </a>
        </li>
        <li :class="{ active: props.activeIndex === 2 }">
          <a href="/articles" @click="handleNav($event, '/articles')">
            <IconNewspaper size="1.85rem" />
            <span>ARTICLES</span>
          </a>
        </li>
        <li :class="{ active: props.activeIndex === 3 }">
          <a href="/tools" @click="handleNav($event, '/tools')">
            <IconScrewdriverWrench size="1.85rem" />
            <span>TOOLS</span>
          </a>
        </li>
        <li :class="{ active: props.activeIndex === 4 }">
          <a href="/contact" @click="handleNav($event, '/contact')">
            <IconCommentDots size="1.85rem" />
            <span>CONTACT</span>
          </a>
        </li>
        <li>
          <button @click="changeTheme">
            <Component :is="themeIconComponent" size="1.85rem" />
            <span>THEME</span>
          </button>
        </li>
      </ul>
    </nav>
  </header>
</template>

<style lang="scss" scoped>
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: fixed;
  top: 0;
  left: 0;
  height: var(--header-height);
  background-color: var(--bg-1);
  width: 100%;
  z-index: 1000;
  transition: top 0.3s ease-in-out;
  box-shadow: 0 4px 4px var(--shadow);
}

header.is-hidden {
  top: calc(var(--header-height) * -1 - 1rem);
}

.logo {
  display: flex;
  align-items: center;
  font-size: 1.5rem;
  height: 100%;
  box-sizing: border-box;
  padding: 0 1rem;
  font-family: 'Anton SC', sans-serif;
  color: var(--accent);
  transition: transform 0.35s ease;

  &:hover {
    transform: translateY(-2px);
  }
}

nav ul {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  li {
    position: relative;
    display: inline-block;

    &::after {
      content: '';
      position: absolute;
      left: 50%;
      width: 0;
      height: 2px;
      background-color: var(--accent);
      transition:
        width 0.4s ease-in-out,
        transform 0.4s ease-in-out;
      transform: translateX(-50%);
    }

    &:hover::after {
      width: 60%;
    }

    a,
    button {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 1rem;
      padding: 0.3rem 1rem;
      color: var(--text-0);

      span {
        font-size: 0.75rem;
      }
    }

    &.active {
      &::after {
        width: 60%;
      }

      * {
        color: var(--accent);
        fill: var(--accent);
      }
    }
  }
}
</style>
