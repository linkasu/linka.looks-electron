<template>
  <section
    v-if="draftLoaded"
    class="typing variant-C"
    :class="{ 'has-error': error, 'output-bottom': outputAtBottom }"
    aria-label="Печать глазами"
  >
    <header class="commands" aria-label="Наборы, управление и речь">
      <eye-button aria-label="К наборам" @click="leave"
        ><typing-icon name="sets" /><small>Наборы</small></eye-button
      >
      <gaze-pause-button compact />
      <eye-button
        class="speech"
        color="primary"
        :aria-label="speaking ? 'Стоп' : 'Озвучить всё'"
        :disabled="!model.draft.text"
        @click="speaking ? stop() : speak()"
      >
        <typing-icon :name="speaking ? 'stop' : 'speak'" />
        <small>{{ speaking ? "Стоп" : "Говорить" }}</small>
      </eye-button>
    </header>

    <div
      ref="output"
      class="draft"
      role="textbox"
      aria-label="Черновик"
      aria-readonly="true"
      aria-multiline="true"
      tabindex="0"
    >
      <span>{{ beforeCaret }}</span
      ><span ref="caret" class="caret" aria-label="Курсор"></span><span>{{ afterCaret }}</span>
    </div>
    <eye-button
      class="output-position"
      :aria-label="`Строка вывода: ${outputAtBottom ? 'Снизу' : 'Сверху'}`"
      @click="store.commit('ui_outputPosition', outputAtBottom ? 'top' : 'bottom')"
    >
      <span aria-hidden="true">{{ outputAtBottom ? "↑" : "↓" }}</span>
      <small>Строка {{ outputAtBottom ? "снизу" : "сверху" }}</small>
    </eye-button>
    <p v-if="error" role="alert" class="status error">{{ error }}</p>

    <div class="predictions" aria-label="Подсказки слов">
      <eye-button
        v-for="index in 3"
        :key="index"
        :disabled="!suggestions[index - 1]"
        :class="{ 'prediction-empty': !suggestions[index - 1] }"
        :aria-label="suggestions[index - 1]?.word ?? predictionStatus"
        @click="acceptSuggestion(suggestions[index - 1])"
        ><template v-if="suggestions[index - 1]"
          ><small class="slot-caption">Подсказка {{ index }}</small
          >{{ suggestions[index - 1]?.word }}</template
        ><template v-else
          ><span aria-hidden="true">—</span
          ><small>{{ index === 1 ? "Нет подсказок" : "Пусто" }}</small></template
        ></eye-button
      >
    </div>

    <nav class="modes" aria-label="Экран клавиатуры">
      <eye-button
        aria-label="Буквы"
        :aria-pressed="model.screen === 'letters'"
        @click="model.show('letters')"
        ><span aria-hidden="true">{{ model.language === "ru" ? "АБВ" : "ABC" }}</span
        ><small>Буквы</small></eye-button
      >
      <eye-button
        :aria-label="model.language === 'ru' ? 'RU → EN' : 'EN → RU'"
        :aria-pressed="model.language === 'en'"
        @click="changeLanguage"
        ><span aria-hidden="true">{{ model.language === "ru" ? "RU" : "EN" }}</span
        ><small>Язык</small></eye-button
      >
      <eye-button
        aria-label="Цифры"
        :aria-pressed="model.screen === 'numbers'"
        @click="model.show('numbers')"
        ><span aria-hidden="true">123</span><small>Цифры</small></eye-button
      >
      <eye-button
        aria-label="Знаки"
        :aria-pressed="model.screen === 'symbols'"
        @click="model.show('symbols')"
        ><span aria-hidden="true">#+=</span><small>Знаки</small></eye-button
      >
      <eye-button
        aria-label="Курсор"
        :aria-pressed="model.screen === 'cursor'"
        @click="model.show('cursor')"
        ><typing-icon name="cursor" /><small>Курсор</small></eye-button
      >
      <eye-button
        :aria-label="model.uppercase ? 'А → а' : 'а → А'"
        :aria-pressed="model.uppercase"
        @click="model.uppercase = !model.uppercase"
        ><typing-icon name="case" /><small>Регистр</small></eye-button
      >
    </nav>

    <div v-if="model.screen === 'cursor'" class="navigation" aria-label="Навигация по тексту">
      <eye-button aria-label="В начало" @click="model.move(0)"
        ><typing-icon name="start" /><small>В начало</small></eye-button
      >
      <eye-button aria-label="Слово влево" @click="model.moveWord(-1)"
        ><typing-icon name="wordLeft" /><small>Слово влево</small></eye-button
      >
      <eye-button aria-label="Символ влево" @click="model.move(model.draft.caret - 1)"
        ><typing-icon name="left" /><small>Символ влево</small></eye-button
      >
      <eye-button aria-label="В конец" @click="model.move(model.characters.length)"
        ><typing-icon name="end" /><small>В конец</small></eye-button
      >
      <eye-button aria-label="Слово вправо" @click="model.moveWord(1)"
        ><typing-icon name="wordRight" /><small>Слово вправо</small></eye-button
      >
      <eye-button aria-label="Символ вправо" @click="model.move(model.draft.caret + 1)"
        ><typing-icon name="right" /><small>Символ вправо</small></eye-button
      >
    </div>
    <template v-else>
      <div class="keys" aria-label="Клавиши">
        <div
          v-for="(row, index) in model.rows"
          :key="`${model.screen}-${index}`"
          class="key-row"
          :style="{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }"
        >
          <eye-button
            v-for="key in row"
            :key="key"
            :aria-label="key === '\n' ? 'Новая строка' : key"
            @click="model.insert(key)"
            ><template v-if="key === '\n'"
              ><typing-icon name="enter" /><small>Строка</small></template
            ><template v-else>{{ key }}</template></eye-button
          >
        </div>
      </div>
    </template>
    <eye-button class="space" aria-label="Пробел" @click="model.insert(' ')"
      ><typing-icon name="space" /><small>{{
        model.language === "ru" ? "Пробел" : "Space"
      }}</small></eye-button
    >
    <div class="editing" role="group" aria-label="Редактирование текста">
      <eye-button aria-label="Отменить" :disabled="!model.history.length" @click="model.undo()"
        ><typing-icon name="undo" /><small>Отмена</small></eye-button
      >
      <eye-button
        aria-label="Убрать символ"
        :disabled="model.draft.caret === 0"
        @click="model.backspace()"
        ><typing-icon name="character" /><small>Символ</small></eye-button
      >
      <eye-button
        aria-label="Убрать слово"
        :disabled="model.draft.caret === 0"
        @click="model.backspaceWord()"
        ><typing-icon name="word" /><small>Слово</small></eye-button
      >
      <eye-button aria-label="Очистить всё" :disabled="!model.draft.text" @click="model.clear()"
        ><typing-icon name="clear" /><small>Очистить</small></eye-button
      >
    </div>
  </section>
  <section v-else class="typing typing-unavailable">
    <p role="alert">{{ error }}</p>
    <div class="commands">
      <gaze-pause-button />
      <eye-button @click="leave">К наборам</eye-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useStore } from "vuex";
import EyeButton from "@/frontend/components/EyeButton.vue";
import GazePauseButton from "@/frontend/components/GazePauseButton.vue";
import TypingIcon from "@/frontend/components/TypingIcon.vue";
import { EyeTyping } from "@/frontend/utils/eyeTyping";
import { loadTypingDraft, saveTypingDraft } from "@/frontend/services/typingDraft";
import {
  typingPredictor,
  releaseTypingPredictor,
  type TypingPredictor
} from "@/frontend/services/typingPredictor";
import { TTS } from "@/frontend/utils/TTS";
import type { TypingEdit } from "@/common/typing";

const props = defineProps<{ predictor?: TypingPredictor; exit?: () => void }>();
const router = useRouter();
const store = useStore();
const outputAtBottom = computed(() => store.state.ui.outputPosition === "bottom");
const model = reactive(new EyeTyping());
const error = ref("");
const draftLoaded = ref(false);
try {
  model.draft = loadTypingDraft();
  draftLoaded.value = true;
} catch {
  error.value = "Не удалось загрузить черновик. Хранилище не изменено.";
}
const speaking = ref(false);
let speechStopped = false;
const suggestions = ref<readonly TypingEdit[]>([]);
const output = ref<HTMLElement | null>(null);
const caret = ref<HTMLElement | null>(null);
const beforeCaret = computed(() => model.characters.slice(0, model.draft.caret).join(""));
const afterCaret = computed(() => model.characters.slice(model.draft.caret).join(""));
const predictionStatus = "Нет подсказок";

watch(
  () => model.draft,
  (draft) => {
    try {
      saveTypingDraft(draft);
      error.value = "";
    } catch {
      error.value = "Черновик не сохранён. Не закрывайте приложение.";
    }
  },
  { flush: "sync" }
);

watch(() => model.draft, scrollToCaret, { flush: "post" });
watch(outputAtBottom, scrollToCaret, { flush: "post" });

watch(
  () => [model.draft.text, model.draft.caret, model.language],
  async (_, __, onCleanup) => {
    let active = true;
    const controller = new AbortController();
    onCleanup(() => {
      active = false;
      controller.abort();
    });
    suggestions.value = [];
    if (!draftLoaded.value || model.language !== "ru" || !model.wordRange.prefix) return;
    try {
      const words = await (props.predictor ?? typingPredictor).suggest(
        { text: model.draft.text, caret: beforeCaret.value.length, language: model.language },
        controller.signal
      );
      if (active)
        suggestions.value = words
          .filter(
            (edit, index) =>
              /^[а-яё]+$/iu.test(edit.word) &&
              words.findIndex((other) => other.word === edit.word) === index
          )
          .slice(0, 3);
    } catch {
      // Manual typing remains available when the predictor fails.
    }
  },
  { immediate: true, flush: "sync" }
);

function leave() {
  if (props.exit) props.exit();
  else void router.push("/§");
}

function acceptSuggestion(edit: TypingEdit | undefined) {
  if (!edit) return;
  if (suggestions.value.includes(edit)) model.accept(edit.draft);
}

function changeLanguage() {
  model.language = model.language === "ru" ? "en" : "ru";
}

function scrollToCaret() {
  if (output.value && caret.value) output.value.scrollTop = caret.value.offsetTop;
}

onMounted(scrollToCaret);

async function speak() {
  if (speaking.value || !model.draft.text) return;
  speaking.value = true;
  speechStopped = false;
  try {
    await TTS.instance.playText(model.draft.text);
  } catch {
    if (!speechStopped) error.value = "Не удалось озвучить текст. Текст не изменён.";
  } finally {
    speaking.value = false;
  }
}

function stop() {
  speechStopped = true;
  TTS.instance.stop();
}

onBeforeUnmount(() => {
  if (speaking.value) TTS.instance.stop();
  if (!props.predictor)
    void releaseTypingPredictor().catch((error) => console.error("Typing cleanup failed", error));
});
</script>

<style scoped>
.typing {
  --output-row: 1;
  --error-row: 2;
  --key-row: 2;
  --edit-row: 5;
  --output-height: clamp(96px, calc(var(--typing-height, 100dvh) / 6), 180px);
  box-sizing: border-box;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(18, minmax(0, 1fr));
  grid-template-rows: var(--output-height) repeat(4, minmax(0, 1fr));
  gap: 6px 10px;
  padding: 8px;
  color: rgb(var(--v-theme-on-surface));
  background: color-mix(in srgb, rgb(var(--v-theme-secondary)) 12%, rgb(var(--v-theme-background)));
  overflow: hidden;
}
.has-error {
  --key-row: 3;
  --edit-row: 6;
  grid-template-rows: var(--output-height) 36px repeat(4, minmax(0, 1fr));
}
.output-bottom {
  --key-row: 1;
  --edit-row: 4;
  --output-row: 5;
  grid-template-rows: repeat(4, minmax(0, 1fr)) var(--output-height);
}
.output-bottom.has-error {
  --key-row: 2;
  --edit-row: 5;
  --output-row: 6;
  --error-row: 1;
  grid-template-rows: 36px repeat(4, minmax(0, 1fr)) var(--output-height);
}
.output-position {
  grid-column: 16 / 19;
  grid-row: var(--output-row);
}
.typing-unavailable {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(129px, 1fr);
}
.typing-unavailable .commands {
  grid-column: 1;
  grid-row: 2;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.commands,
.modes,
.editing,
.predictions,
.keys,
.key-row,
.navigation {
  display: grid;
  gap: 6px;
  min-height: 0;
  min-width: 0;
}
.commands {
  grid-column: 1 / 8;
  grid-row: var(--edit-row);
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: 10px;
}
.modes {
  grid-column: 16 / 19;
  grid-row: var(--key-row) / span 3;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
}
.editing {
  grid-column: 12 / 19;
  grid-row: var(--edit-row);
  grid-template-columns: repeat(4, minmax(0, 1fr));
  column-gap: 10px;
}
.predictions {
  grid-column: 1 / 3;
  grid-row: var(--key-row) / span 3;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(3, minmax(0, 1fr));
}
.keys,
.navigation {
  grid-column: 3 / 16;
  grid-row: var(--key-row) / span 3;
}
.error {
  grid-column: 1 / -1;
  grid-row: var(--error-row);
  font-size: 16px;
  line-height: 18px;
}
.key-row {
  width: 100%;
}
.status {
  align-self: center;
  margin: 0;
}
.keys {
  grid-template-rows: repeat(3, minmax(0, 1fr));
}
.navigation {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}
.typing :deep(.eyebtn) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 10px;
  font-size: clamp(24px, 3vw, 40px);
  line-height: 1.1;
  white-space: nowrap;
  padding: 4px;
}
.typing :deep(small) {
  font-size: clamp(14px, 1.35vw, 18px);
  font-weight: 600;
  line-height: 1.2;
  white-space: normal;
  overflow-wrap: anywhere;
}
.predictions,
.modes,
.commands,
.editing,
.keys,
.navigation {
  border-radius: 10px;
  outline: 1px solid color-mix(in srgb, rgb(var(--v-theme-secondary)) 55%, transparent);
  outline-offset: 2px;
}
.modes :deep(.eyebtn),
.navigation :deep(.eyebtn) {
  background: color-mix(in srgb, rgb(var(--v-theme-secondary)) 24%, rgb(var(--v-theme-surface)));
  font-size: clamp(20px, 2.4vw, 34px);
  font-weight: 600;
}
.modes :deep(small) {
  font-size: clamp(12px, 1.3vw, 18px);
}
.commands :deep(.eyebtn:not(.speech)) {
  background: color-mix(in srgb, rgb(var(--v-theme-secondary)) 8%, rgb(var(--v-theme-surface)));
}
.editing :deep(.eyebtn) {
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 9%, rgb(var(--v-theme-surface)));
}
.typing :deep(.space) {
  grid-column: 8 / 12;
  grid-row: var(--edit-row);
  border: 2px solid rgb(var(--v-theme-primary));
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 9%, rgb(var(--v-theme-surface)));
}
.typing :deep(.typing-icon) {
  font-size: clamp(28px, 3vw, 40px);
}
.typing :deep(.space .typing-icon) {
  width: 2em;
}
.typing :deep(.eyebtn:focus-visible),
.draft:focus-visible {
  outline: 3px solid rgb(var(--v-theme-on-surface));
  outline-offset: -5px;
}
.typing :deep(.eyebtn.isInside) {
  box-shadow: inset 0 0 0 4px rgb(var(--v-theme-primary));
}
.typing :deep(.gaze-pause strong) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.predictions :deep(.eyebtn) {
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 12%, rgb(var(--v-theme-surface)));
  font-size: clamp(16px, 1.6vw, 22px);
  white-space: normal;
  overflow-wrap: anywhere;
}
.predictions :deep(.slot-caption) {
  position: absolute;
  top: 12px;
  left: 8px;
  font-size: clamp(12px, 1vw, 14px);
}
.predictions :deep(.prediction-empty) {
  background: color-mix(in srgb, rgb(var(--v-theme-secondary)) 5%, rgb(var(--v-theme-surface)));
  border-style: dashed;
  color: color-mix(in srgb, rgb(var(--v-theme-on-surface)) 75%, rgb(var(--v-theme-surface)));
}
.keys :deep(.eyebtn) {
  font-size: clamp(32px, 4vw, 56px);
  line-height: 1.1;
}
.typing :deep([aria-pressed="true"]) {
  box-shadow: inset 0 0 0 3px rgb(var(--v-theme-primary));
}
.draft {
  grid-column: 1 / 16;
  grid-row: var(--output-row);
  min-height: 0;
  position: relative;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: clamp(32px, 3vw, 56px);
  line-height: 1.2;
  padding: 8px 12px;
  border: 2px solid rgb(var(--v-theme-secondary));
  border-left: 6px solid rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-surface));
  border-radius: 10px;
}
.caret {
  position: relative;
  display: inline-block;
  width: 0;
  height: 1em;
  vertical-align: text-bottom;
}
.caret::after {
  content: "";
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  border-inline-start: 2px solid rgb(var(--v-theme-primary));
  pointer-events: none;
}
</style>
