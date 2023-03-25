import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SetExplorerView from '../views/SetExplorerView.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    
    redirect: '/§'
  },
  {
    path: '/:path',
    name: 'home',
    component: HomeView
  }, {
    path: '/set/:path',
    name: 'SetExplorer',
    component: SetExplorerView
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
