<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AppWideHeader from '@/components/AppWideHeader.vue';
import AppNarrowHeader from '@/components/AppNarrowHeader.vue';

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

const isNarrowWindow = ref(false);
const headerComponent = computed(() => (isNarrowWindow.value ? AppNarrowHeader : AppWideHeader));

function handleResize() {
  isNarrowWindow.value = window.innerWidth < 1024;
}

onMounted(() => {
  handleResize();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <Component :is="headerComponent" :active-index="props.activeIndex" :current-path="props.currentPath" />
</template>
