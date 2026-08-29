type Props<T> = { value: T; label: string }
function Greeting<T extends string>(props: Props<T>) {
  const { value, label } = props
  return (
    <div className='greeting' data-value={value}>
      <span>{label}</span>
      <>
        <p>hello {value}</p>
        <Greeting value='nested' label='inner' />
      </>
    </div>
  )
}
export const el = <Greeting<string> value='hi' label='test' />
export const frag = <>fragment content</>
export const selfClosing = <input type='text' disabled />
