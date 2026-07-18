import axios from "axios";
import { MetricEvent } from "./MetricEvents";
import type { TelemetryConsent } from "./TelemetryConsent";

export class Metric {
  private static serverUrl = "https://metric.linka.su"; // Replace with the actual URL of the metric server
  private static telemetryConsent: TelemetryConsent = "unknown";
  private static consentProof = {
    policy: "technical-events",
    version: 1,
    granted: true
  } as const;

  public static setTelemetryConsent (consent: TelemetryConsent): void {
    this.telemetryConsent = consent;
  }

  public static async registerEvent (pcHash: string, eventName: MetricEvent): Promise<void> {
    try {
      if (this.telemetryConsent !== "enabled" || pcHash.length !== 36) return;
      const endpoint = `${this.serverUrl}/registerEvent`;
      const data = { hash: pcHash, eventName, consent: this.consentProof };

      await axios.post(endpoint, data);
    } catch (error) {
      console.error("Failed to register event:", error);
    }
  }

  public static async sendActivationEmail (email: string): Promise<void> {
    const endpoint = `${this.serverUrl}/requestActivation`;
    const data = { email };

    await axios.post(endpoint, data, {
    });
  }

  public static async activateAccount (email: string, code: string): Promise<string | undefined> {
    try {
      const endpoint = `${this.serverUrl}/activate`;
      const data = { email, code };

      const response = await axios.post(endpoint, data);

      return response.data.hash;
    } catch (error) {
      console.error("Failed to activate account:", error);
      return undefined;
    }
  }
}
