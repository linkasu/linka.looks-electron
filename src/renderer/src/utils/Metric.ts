import axios, { AxiosResponse } from 'axios'
import { MetricEvent } from './MetricEvents'

export const Metric = {
  serverUrl: 'https://metric.linka.su', // Replace with the actual URL of the metric server
  async registerEvent(pcHash: string, eventName: MetricEvent, eventData?: any): Promise<void> {
    try {
      if (pcHash.length !== 36) return
      const endpoint = `${this.serverUrl}/registerEvent`
      const data = { hash: pcHash, eventName, eventData }

      await axios.post(endpoint, data)
    } catch (error) {
      console.error('Failed to register event:', error)
    }
  },
  async sendActivationEmail(email: string): Promise<void> {
    const endpoint = `${this.serverUrl}/requestActivation`
    const data = { email }

    await axios.post(endpoint, data, {})
  },

  async activateAccount(email: string, code: string): Promise<string | undefined> {
    try {
      const endpoint = `${this.serverUrl}/activate`
      const data = { email, code }

      const response = await axios.post(endpoint, data)

      return response.data.hash
    } catch (error) {
      console.error('Failed to activate account:', error)
      return undefined
    }
  }
}
