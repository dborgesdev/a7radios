import { useId, useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function PasswordField({ label, ...input }: ComponentProps<'input'> & { label: string }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return <div className="password-field">
    <label htmlFor={id}>{label}</label>
    <div><input {...input} id={id} type={visible ? 'text' : 'password'} />
      <button className="icon-button" type="button" aria-controls={id} aria-label="Mostrar senha" aria-pressed={visible} onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  </div>
}

export function passwordError(password: string) {
  const length = [...password].length
  if (length < 8 || length > 128) return 'Use de 8 a 128 caracteres.'
  const trimCodes = [0, 9, 10, 11, 13, 32]
  if (trimCodes.includes(password.charCodeAt(0)) || trimCodes.includes(password.charCodeAt(password.length - 1))) {
    return 'Retire os espaços no início ou no final da senha.'
  }
  if (!/\p{Lu}/u.test(password)) return 'Inclua uma letra maiúscula.'
  if (!/\p{Ll}/u.test(password)) return 'Inclua uma letra minúscula.'
  if (!/[0-9]/.test(password)) return 'Inclua um número.'
  if (!/[\p{P}\p{S}]/u.test(password)) return 'Inclua um caractere especial.'
}
