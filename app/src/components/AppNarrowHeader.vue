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
const isOpen = ref(false);
const headerRef = ref(null);
const isHeaderVisible = ref(true);
const lastScrollY = ref(0);
let unwatchSystemTheme = null;

const themeIconComponent = computed(() => (theme.value === 'light' ? IconMoon : IconSun));

function toggleMenu() {
  isOpen.value = !isOpen.value;
}

function changeTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light';
  applyTheme(theme.value);
}

const handleClickOutside = (event) => {
  if (headerRef.value && !headerRef.value.contains(event.target)) {
    isOpen.value = false;
  }
};

function handleScroll() {
  const currentScrollY = window.scrollY;

  if (isOpen.value) {
    isOpen.value = false;
  }

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
  isOpen.value = false;
}

onMounted(() => {
  theme.value = getCurrentTheme();
  unwatchSystemTheme = watchSystemTheme((next) => {
    theme.value = next;
    applyTheme(next);
  });
  window.addEventListener('click', handleClickOutside);
  window.addEventListener('scroll', handleScroll);
});

onBeforeUnmount(() => {
  unwatchSystemTheme?.();
  window.removeEventListener('click', handleClickOutside);
  window.removeEventListener('scroll', handleScroll);
});
</script>

<template>
  <header ref="headerRef" class="app-narrow-header" :class="{ 'is-active': isOpen, 'is-hidden': !isHeaderVisible }">
    <div class="header-wrapper">
      <a class="logo" href="/" @click="handleNav($event, '/')">PORTFOLIO</a>

      <button class="burger-btn" @click="toggleMenu" aria-label="メニューを開閉する">
        <span class="burger-line"></span>
        <span class="burger-line"></span>
        <span class="burger-line"></span>
      </button>
    </div>

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
  position: relative;
  width: 100%;
}

.header-wrapper {
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

.logo {
  display: flex;
  align-items: center;
  font-size: 1.5rem;
  height: 100%;
  box-sizing: border-box;
  padding: 0 1rem;
  font-family: 'Anton SC', sans-serif;
  color: var(--accent);
}

.burger-btn {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 2rem;
  height: 1.6rem;
  padding: 0;
  position: relative;
  margin-right: 1rem;

  .burger-line {
    width: 100%;
    height: 2px;
    background-color: var(--border);
    transition:
      transform 0.3s ease,
      opacity 0.3s ease;
  }
}

nav {
  position: fixed;
  top: -100vh;
  left: 0;
  width: 100%;
  height: 19rem;
  background-color: var(--bg-1);
  transition: top 0.3s ease-in-out;
  padding: 1rem;
  box-sizing: border-box;
  z-index: 10;
  box-shadow: 0 4px 4px var(--shadow);

  ul {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      a,
      button {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        background: none;
        border: none;
        padding: 0.5rem 0;
        cursor: pointer;
        font-size: 1rem;
        color: var(--text-0);
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
}

header.is-active {
  .burger-btn {
    .burger-line:nth-child(1) {
      transform: translateY(13px) rotate(45deg);
    }
    .burger-line:nth-child(2) {
      opacity: 0;
    }
    .burger-line:nth-child(3) {
      transform: translateY(-10px) rotate(-45deg);
    }
  }

  nav {
    top: var(--header-height);
  }
}

header.is-hidden {
  .header-wrapper {
    top: calc(var(--header-height) * -1 - 1rem);
  }

  &:not(.is-active) nav {
    top: -100vh;
  }
}
</style>
