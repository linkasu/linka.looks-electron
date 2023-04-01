import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import HomeViewAppBar from '../views/HomeView.appbar.vue'
import SetExplorerView from '../views/SetExplorerView.vue'
import SetExplorerViewAppBar from '../views/SetExplorerView.appbar.vue'
import EditorView from '../views/EditorView.vue'
import EditorViewAppBar from '../views/EditorView.appbar.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',

    redirect: '/§'
  },
  {
    path: '/:path',
    name: 'home',
    components: {
      default: HomeView,
      appbar: HomeViewAppBar
    }
  }, {
    path: '/set/:path',
    name: 'SetExplorer',
    components: {
      default: SetExplorerView,
      appbar: SetExplorerViewAppBar
    }
  }, {
    path: '/edit/:path',
    name: 'Editor',
    components: {
      default: EditorView,
      appbar: EditorViewAppBar
    }
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
