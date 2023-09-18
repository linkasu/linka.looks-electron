<template>
    <v-dialog :model-value="true" persistent max-width="600px" min-width="360px">
        <v-alert color="error" v-if="error">
            {{error}}
        </v-alert>
        <v-card v-if="step == 0">
            <v-card-title primary-title>
                LINKa. смотри. Регистрация.
            </v-card-title>
            <v-card-text>
                Благодарим вас за установку LINKa смотри. Совсем скоро вы сможете использовать программу, но для начала
                введите ваш email. Вы можете использовать один email на разных компьютерах.
            </v-card-text>
            <v-card-text>
                <v-form @submit.prevent="getCode()">
                    <v-text-field label="E-mail" v-model="email" type="email" required></v-text-field>
                </v-form>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn @click="getCode()">
                    Получить код
                </v-btn>
            </v-card-actions>
        </v-card>
        <v-card v-if="step == 1">
            <v-card-title primary-title>
                Проверка кода
            </v-card-title>
            <v-card-text>
                Мы отправили шестизначный проверолчный код на вашу почту <b>{{ email }}</b>.
            </v-card-text>
            <v-card-text>
                <v-form @submit.prevent="checkCode">
                    <v-text-field label="Код" v-model="code" required :rules="[(s)=>s.length===6]"></v-text-field>
                </v-form>
            </v-card-text>
            <v-card-actions>
                <v-btn @click="step = 0">Указать другой e-mail</v-btn>
                <v-spacer></v-spacer>
                <v-btn v-if="code.length===6" @click="checkCode()">
                    Проверить код
                </v-btn>
            </v-card-actions>
        </v-card>

    </v-dialog>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref } from "vue";
import { useStore } from "vuex";
import { Metric } from "../utils/Metric";

const store = useStore();

const step = ref(0);
const code = ref("");
const email: Ref<string> = ref("");
const error: Ref<string> = ref("");

async function getCode () {
    try {
        await Metric.sendActivationEmail(email.value);
        step.value = 1;
        error.value = "";
    } catch (err) {
        email.value = "";
        console.error(err);
        error.value = "Ошибка запроса";
    }
}

async function checkCode () {
    if (code.value.length !== 6) return;
    try {
        const pcHash = await Metric.activateAccount(email.value, code.value);
        if (pcHash) {
            store.commit("pcHash", pcHash);
        }
    } catch (err) {
        error.value = "Ошибка запроса";
    }
}
</script>
