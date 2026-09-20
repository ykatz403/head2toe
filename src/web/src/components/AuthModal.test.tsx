import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../lib/api'
import { AuthProvider } from '../lib/auth'
import { AuthModal } from './AuthModal'

vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api: { register: vi.fn(), login: vi.fn() } }))
const register = vi.mocked(api.register)
const login = vi.mocked(api.login)

function setup() {
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(<AuthProvider><AuthModal onClose={onClose} /></AuthProvider>)
  return { user, onClose }
}
const fill = async (user: ReturnType<typeof userEvent.setup>, email = 'me@example.com', pw = 'password123') => {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), pw)
}

beforeEach(() => {
  register.mockReset()
  login.mockReset()
})

describe('AuthModal', () => {
  it('opens on account creation and explains why to sign up', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Keep your scan for good' })).toBeInTheDocument()
  })

  it('creates an account, stores the session and closes', async () => {
    register.mockResolvedValue({ token: 't.o.k', email: 'me@example.com' })
    const { user, onClose } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(register).toHaveBeenCalledWith('me@example.com', 'password123')
    expect(localStorage.getItem('h2t-token')).toBe('t.o.k')
  })

  it('switches to sign in and calls login instead', async () => {
    login.mockResolvedValue({ token: 'x.y.z', email: 'me@example.com' })
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'I have an account' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(login).toHaveBeenCalledWith('me@example.com', 'password123')
    expect(register).not.toHaveBeenCalled()
  })

  it('shows the server error and stays open', async () => {
    register.mockRejectedValue(new ApiError(409, 'An account with this email already exists.'))
    const { user, onClose } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.')
    expect(onClose).not.toHaveBeenCalled()
    expect(localStorage.getItem('h2t-token')).toBeNull()
  })

  it('clears a previous error when switching mode', async () => {
    register.mockRejectedValue(new ApiError(409, 'An account with this email already exists.'))
    const { user } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'I have an account' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not submit an invalid email or a short password (native validation)', async () => {
    const { user } = setup()
    await fill(user, 'not-an-email', 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(register).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '8')
  })

  it('disables the button while a request is in flight (no double submit)', async () => {
    let done!: (v: { token: string; email: string }) => void
    register.mockReturnValue(new Promise((r) => (done = r)))
    const { user } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
    done({ token: 'a.b.c', email: 'me@example.com' })
  })

  it('closes with Escape', async () => {
    const { user, onClose } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('uses password-manager friendly autocomplete hints', async () => {
    const { user } = setup()
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
    await user.click(screen.getByRole('button', { name: 'I have an account' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })
})
