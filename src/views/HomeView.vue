<template>
  <v-layout full-height class="root">
    <output-line/>
    <div></div>
   </v-layout>
</template>

<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import OutputLine from "@/components/OutputLine.vue";
@Options({
  components: {
    OutputLine
  }
})
export default  class HomeView extends Vue {
  
}

</script>
<style scoped>
.root{
  display: grid;
  grid-template-rows: 2fr 8fr;
}
.root>div{
  border: 1px solid black;
  width: 100%;
}
</style>