import store from '@/store';
import { eStore } from '@/store/eStore';
import axios, { AxiosResponse } from 'axios';

export class Metric {
  private static serverUrl = 'https://metric.linka.su'; // Replace with the actual URL of the metric server

  public static async registerEvent(eventName: string, eventData?: any): Promise<void> {
    try {
        const pcHash = store.state.pcHash
      const endpoint = `${this.serverUrl}/registerEvent`;
      const data = { hash: pcHash, eventName, eventData };

      await axios.post(endpoint, data);
      console.log('Event registered successfully:', eventName);
    } catch (error) {
      console.error('Failed to register event:', error);
    }
  }

  public static async sendActivationEmail(email: string): Promise<void> {
    const endpoint = `${this.serverUrl}/requestActivation`;
      console.log(endpoint);
      console.log(email);
      
      const data = { email };

      await axios.post(endpoint, data, {
      });
      
  }

  public static async activateAccount(email: string, code: string): Promise<string | undefined> {
    try {
      const endpoint = `${this.serverUrl}/activate`;
      const data = { email, code };

      const response = await axios.post(endpoint, data);

      console.log('Account activated successfully:', email);
      return response.data.hash;
    } catch (error) {
      console.error('Failed to activate account:', error);
      return undefined;
    }
  }
}
