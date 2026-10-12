// Section labels written like X12 segments: WORKLIST~OPEN~$10,383~
export function Seg({ parts, as: Tag = 'div', className = '' }: { parts: (string | number)[]; as?: 'div' | 'h1' | 'h2' | 'span'; className?: string }) {
  return (
    <Tag className={`seg-line ${className}`}>
      {parts.map((p, i) => (
        <span key={i}>
          <span className={i === 0 ? 'seg-id' : 'seg-el'}>{p}</span>
          <span className="seg-sep" aria-hidden="true">{i === parts.length - 1 ? '~' : '*'}</span>
        </span>
      ))}
    </Tag>
  )
}
