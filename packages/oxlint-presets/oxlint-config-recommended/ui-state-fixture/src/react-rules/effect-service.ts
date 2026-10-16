interface MicroVM {
  readonly start: string
}

declare const MicroVM: { readonly use: <A>(f: (vm: MicroVM) => A) => A }
declare const useSync: <A>(value: A) => A

export const started = MicroVM.use((vm) => vm.start)
export const synced = useSync(1)
