import { flushPromises, shallowMount } from "@vue/test-utils";
import QuizOutputLine from "@/frontend/components/QuizOutputLine.vue";
import type { ConfigFile } from "@/common/interfaces/ConfigFile";

const { speak, push } = vi.hoisted(() => ({ speak: vi.fn(), push: vi.fn() }));
vi.mock("@/frontend/utils/TTS", () => ({ TTS: { instance: { forcePlayText: speak } } }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { path: "§quiz.linka" } }),
  useRouter: () => ({ push })
}));

function mountQuiz(read = true) {
  const config: ConfigFile = {
    version: "3.0",
    withoutSpace: false,
    quizReadQuestion: read,
    pages: ["Первый вопрос", "Второй вопрос"].map((question) => ({
      id: question,
      mode: "quiz",
      rows: 1,
      columns: 1,
      cards: [],
      question
    }))
  };
  return shallowMount(QuizOutputLine, {
    props: { config, page: 0, errors: 0, waitingForNext: false },
    global: {
      stubs: {
        VLayout: { template: "<div><slot /></div>" },
        VDialog: { name: "VDialog", props: ["modelValue"], template: "<div><slot /></div>" },
        VIcon: true,
        VCard: { template: "<div><slot /></div>" },
        VCardTitle: true,
        VCardText: true
      }
    }
  });
}

beforeEach(() => {
  speak.mockReset().mockResolvedValue(undefined);
  push.mockReset().mockResolvedValue(undefined);
});

it("treats outside/Escape dismissal of the start dialog as starting the quiz", async () => {
  const wrapper = mountQuiz();
  wrapper.findAllComponents({ name: "VDialog" })[1].vm.$emit("update:modelValue", false);
  await flushPromises();
  expect(wrapper.emitted("dialog")?.at(-1)).toEqual([false]);
  expect(speak).toHaveBeenCalledWith("Первый вопрос");
  wrapper.unmount();
});

it("leaves the completed quiz on outside/Escape dismissal instead of stranding blocked cards", async () => {
  const wrapper = mountQuiz();
  await wrapper.setProps({ page: 2 });
  wrapper.findAllComponents({ name: "VDialog" })[0].vm.$emit("update:modelValue", false);
  await flushPromises();
  expect(push).toHaveBeenCalledWith("/");
  wrapper.unmount();
});

it("does not start an old question when pending introduction finishes after unmount", async () => {
  let finish!: () => void;
  speak.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const wrapper = mountQuiz();
  wrapper.findAllComponents({ name: "VDialog" })[1].vm.$emit("update:modelValue", false);
  await flushPromises();
  wrapper.unmount();
  finish();
  await flushPromises();
  expect(speak).toHaveBeenCalledTimes(1);
});

for (const read of [false, true]) {
  it(`respects automatic question reading=${read} at start and page transition`, async () => {
    const wrapper = mountQuiz(read);
    wrapper.findAllComponents({ name: "VDialog" })[1].vm.$emit("update:modelValue", false);
    await flushPromises();
    expect(speak.mock.calls.some(([text]) => text === "Первый вопрос")).toBe(read);
    await wrapper.setProps({ page: 1 });
    await flushPromises();
    expect(speak.mock.calls.some(([text]) => text === "Второй вопрос")).toBe(read);
    wrapper.unmount();
  });
}

it("serializes manual question speech and recovers visibly after a speech failure", async () => {
  let fail!: (reason: Error) => void;
  const wrapper = mountQuiz(false);
  wrapper.findAllComponents({ name: "VDialog" })[1].vm.$emit("update:modelValue", false);
  await flushPromises();
  speak.mockClear().mockImplementationOnce(
    () =>
      new Promise<void>((_, reject) => {
        fail = reject;
      })
  );
  const listen = wrapper.get("[aria-label='Послушать вопрос']");
  await listen.trigger("click");
  await listen.trigger("click");
  expect(speak).toHaveBeenCalledTimes(1);
  fail(new Error("unavailable"));
  await flushPromises();
  expect(wrapper.text()).toContain("Озвучка недоступна");
  speak.mockResolvedValue(undefined);
  await listen.trigger("click");
  await flushPromises();
  expect(speak).toHaveBeenCalledTimes(2);
  expect(wrapper.text()).not.toContain("Озвучка недоступна");
  wrapper.unmount();
});

it("keeps automatic reading on the next page even while the previous question speech is pending", async () => {
  const wrapper = mountQuiz();
  speak
    .mockImplementationOnce(async () => undefined)
    .mockImplementationOnce(() => new Promise<void>(() => {}));
  wrapper.findAllComponents({ name: "VDialog" })[1].vm.$emit("update:modelValue", false);
  await flushPromises();
  await wrapper.setProps({ page: 1 });
  await flushPromises();
  expect(speak).toHaveBeenCalledWith("Второй вопрос");
  wrapper.unmount();
});
