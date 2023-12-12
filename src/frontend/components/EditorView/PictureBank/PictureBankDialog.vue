<template>
    <v-dialog v-model="dialog" persistent transition="dialog-transition">
        <template v-slot:activator="{ }">
            <v-btn @click="dialog = true" block color="primary" dark class="mb-2">
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
                    <v-col cols="6">
                        <v-text-field label="Поиск" v-model="search" @update:model-value="onSearchChange"></v-text-field>
                    </v-col>
                    <v-col cols="6">
                        <v-select :items="categories" item-title="name" item-value="id" label="Категория"
                            v-model="selectedCategory" @update:model-value="onCategoryChange"></v-select>
                    </v-col>
                </v-row>
            </v-card-text>
            <v-card-text>
                <v-row>
                    <v-col v-for="picture in pictures" :key="picture.id" cols="3">
                        <v-card>
                            <v-img :src="'https://pictures.linka.su/picture/' + picture.id + '/buffer'"
                                height="200px"></v-img>
                            <v-card-title>{{ picture.name }}</v-card-title>
                            <v-card-actions>
                                <v-spacer></v-spacer>
                                <v-btn color="blue darken-1" @click="paste(picture)">Вставить</v-btn>
                            </v-card-actions>
                        </v-card>
                    </v-col>
                </v-row>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="blue darken-1" @click="dialog = false">Закрыть</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts" setup>
import { PictureBankApi } from "pictures.bank-api";
import { Category } from "pictures.bank-api/dist/types/category";
import { Picture } from "pictures.bank-api/dist/types/picture";
import { ref } from "vue";
import { storageService } from "@/frontend/services/card-storage-service";

const { file } = defineProps({
  file: {
    type: String,
    required: true
  }
});
const emit = defineEmits<{
    (e: "image", value: string): void,
    (e: "name", value: string): void
}>();

const dialog = ref(false);

const api = new PictureBankApi();

const categories = ref<Category[]>([]);
const selectedCategory = ref<string | null>(null);
api.categories.getCategories().then((data) => {
  if (categories.value.length === data.length) return;
  categories.value = data;
});

const search = ref("");

const pictures = ref<Picture[]>([]);

function onCategoryChange () {
  if (selectedCategory.value === null) return;
  search.value = "";
  api.pictures.getPicturesByCategory(selectedCategory.value).then((data) => {
    pictures.value = data;
  });
}

function onSearchChange () {
  if (search.value === "") {
    onCategoryChange();
    return;
  }
  if (search.value.length < 1) return;
  selectedCategory.value = null;
  api.pictures.searchPictures(search.value).then((data) => {
    pictures.value = data;
  });
}
async function paste (picture: Picture) {
  const res = await storageService.downloadImageFromBank(file, picture.id);
  emit("image", res);
  emit("name", picture.name);
  dialog.value = false;
}

</script>
