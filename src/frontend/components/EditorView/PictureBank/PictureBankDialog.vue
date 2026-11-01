<template>
  <v-dialog
    v-model="dialog"
    :persistent="pasting"
    scrollable
    max-width="1100"
    transition="dialog-transition"
  >
    <template v-slot:activator="{}">
      <v-btn @click="dialog = true" block variant="tonal" class="mb-2">
        <v-icon left>mdi-web</v-icon>
        Банк картинок
      </v-btn>
    </template>
    <v-card>
      <v-card-title>
        <span class="headline">Банк картинок</span>
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="6">
            <v-text-field
              label="Поиск"
              v-model="search"
              :disabled="pasting"
              @update:model-value="onSearchChange"
            ></v-text-field>
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              :items="categories"
              item-title="name"
              item-value="id"
              label="Категория"
              v-model="selectedCategory"
              :disabled="pasting || categoriesLoading"
              @update:model-value="onCategoryChange"
            ></v-select>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-text aria-live="polite" :aria-busy="loading || pasting || categoriesLoading">
        <v-progress-linear
          v-if="loading || pasting || categoriesLoading"
          indeterminate
          color="primary"
          aria-label="Загрузка картинок"
        />
        <v-alert v-if="errorMessage" type="error" variant="tonal" role="alert">
          {{ errorMessage }}
          <v-btn v-if="categoryError" variant="text" @click="loadCategories"
            >Повторить загрузку категорий</v-btn
          >
        </v-alert>
        <p
          v-if="!loading && !categoriesLoading && !pictures.length && !errorMessage"
          class="results-hint"
        >
          {{
            searched
              ? "Картинки не найдены. Измените запрос или категорию."
              : "Введите название или выберите категорию."
          }}
        </p>
        <v-row>
          <v-col v-for="picture in pictures" :key="picture.id" cols="12" sm="6" md="4" lg="3">
            <v-card>
              <v-img
                :src="'https://pictures.linka.su/picture/' + picture.id + '/buffer'"
                height="200px"
                :alt="picture.name"
              ></v-img>
              <v-card-title class="picture-title">{{ picture.name }}</v-card-title>
              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn
                  color="primary"
                  variant="tonal"
                  :aria-label="'Вставить картинку: ' + picture.name"
                  :disabled="pasting || loading"
                  @click="paste(picture)"
                  >Вставить</v-btn
                >
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn :disabled="pasting" @click="dialog = false">Закрыть банк картинок</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { PictureBankApi } from "pictures.bank-api";
import { Category } from "pictures.bank-api/dist/types/category";
import { Picture } from "pictures.bank-api/dist/types/picture";
import { ref, watch } from "vue";
import { storageService } from "@/frontend/services/card-storage-service";

const { file } = defineProps({
  file: {
    type: String,
    required: true
  }
});
const emit = defineEmits<{
  (e: "image", value: string): void;
  (e: "name", value: string): void;
}>();

const dialog = ref(false);

const api = new PictureBankApi();

const categories = ref<Category[]>([]);
const selectedCategory = ref<string | null>(null);
const loading = ref(false);
const categoriesLoading = ref(false);
const pasting = ref(false);
const searched = ref(false);
const errorMessage = ref("");
const categoryError = ref(false);
let requestId = 0;

watch(dialog, (open) => {
  if (open && !categories.value.length) void loadCategories();
});

async function loadCategories() {
  if (categoriesLoading.value) return;
  categoriesLoading.value = true;
  categoryError.value = false;
  errorMessage.value = "";
  try {
    categories.value = await api.categories.getCategories();
  } catch (error) {
    console.error(error);
    categoryError.value = true;
    errorMessage.value =
      "Не удалось загрузить категории. Можно повторить загрузку или найти картинку по названию.";
  } finally {
    categoriesLoading.value = false;
  }
}

const search = ref("");

const pictures = ref<Picture[]>([]);

function onCategoryChange() {
  search.value = "";
  void loadPictures();
}

function onSearchChange() {
  if (search.value.trim()) selectedCategory.value = null;
  void loadPictures();
}

async function loadPictures() {
  const id = ++requestId;
  const query = search.value.trim();
  pictures.value = [];
  errorMessage.value = "";
  loading.value = false;
  searched.value = !!query || selectedCategory.value !== null;
  if (!searched.value) return;
  loading.value = true;
  try {
    const data = query
      ? await api.pictures.searchPictures(query)
      : await api.pictures.getPicturesByCategory(selectedCategory.value!);
    if (id === requestId) pictures.value = data;
  } catch (error) {
    if (id !== requestId) return;
    console.error(error);
    errorMessage.value = "Не удалось загрузить картинки. Проверьте подключение и повторите поиск.";
  } finally {
    if (id === requestId) loading.value = false;
  }
}
async function paste(picture: Picture) {
  if (pasting.value) return;
  pasting.value = true;
  errorMessage.value = "";
  try {
    const res = await storageService.downloadImageFromBank(file, picture.id);
    if (!res) throw new Error("Image download returned no file");
    emit("image", res);
    emit("name", picture.name);
    dialog.value = false;
  } catch (error) {
    console.error(error);
    errorMessage.value = "Не удалось добавить картинку. Попробуйте ещё раз.";
  } finally {
    pasting.value = false;
  }
}
</script>

<style scoped>
.picture-title {
  white-space: normal;
  font-size: 1rem;
}
.results-hint {
  color: var(--linka-muted);
  padding: 24px 0;
}
</style>
