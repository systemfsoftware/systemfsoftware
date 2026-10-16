interface Canvas {
  readonly getByRole: (role: string) => unknown
}

export const Primary = {
  play: ({ canvas }: { readonly canvas: Canvas }): void => {
    canvas.getByRole('button')
  },
}
