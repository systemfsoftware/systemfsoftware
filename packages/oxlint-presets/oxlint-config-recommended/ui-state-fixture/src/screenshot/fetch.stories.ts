export const Primary = {
  play: async (): Promise<void> => {
    await window.fetch('/demand')
  },
}
