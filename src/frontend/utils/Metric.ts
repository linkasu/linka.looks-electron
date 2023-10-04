import axios from "axios";
import { logEvent } from "firebase/analytics";
import { MetricEvent } from "./MetricEvents";
import { firebaseAnalytics } from "./firebase";

export class Metric {
  public static async registerEvent (eventName: MetricEvent, eventData?: any): Promise<void> {
    logEvent(firebaseAnalytics, eventName.toString(), eventData);
  }
}
