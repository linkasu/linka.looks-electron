import axios from "axios";

const endpoint = "https://metric.linka.su";

export const activationService = {
  async sendEmail (email: string): Promise<void> {
    await axios.post(`${endpoint}/requestActivation`, { email });
  },
  async activate (email: string, code: string): Promise<string | undefined> {
    try {
      const response = await axios.post(`${endpoint}/activate`, { email, code });
      return typeof response.data.hash === "string" ? response.data.hash : undefined;
    } catch {
      return undefined;
    }
  }
};
