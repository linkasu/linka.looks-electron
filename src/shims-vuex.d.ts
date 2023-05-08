import { Store } from "vuex";
import { LINKaStore } from "./store/LINKaStore";

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: Store<LINKaStore> ;
  }
}

