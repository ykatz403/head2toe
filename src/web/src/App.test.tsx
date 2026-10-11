import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './lib/auth'

// App itself only wires up the header, hero copy, PhotoTryOn and the auth modal - PhotoTryOn's own
// behavior is covered in PhotoTryOn.test.tsx, so it's stubbed out here to keep this file App-level.
vi.mock('./components/PhotoTryOn', () => ({
  PhotoTryOn: () => <div data-testid="photo-tryon" />,
}))

const renderApp = () => {
  const user = userEvent.setup()
  render(<AuthProvider><App /></AuthProvider>)
  return user
}

describe('App', () => {
  it('shows the brand, hero copy and the try-on flow', () => {
    renderApp()
    expect(screen.getByText('Head2')).toBeInTheDocument()
    expect(screen.getByText(/See yourself wearing it before you buy/)).toBeInTheDocument()
    expect(screen.getByTestId('photo-tryon')).toBeInTheDocument()
  })

  it('offers sign in when signed out', () => {
    renderApp()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('opens and closes the sign-in dialog', async () => {
    const user = renderApp()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the signed-in account and can sign out', () => {
    localStorage.setItem('h2t-token', 'a.b.c')
    localStorage.setItem('h2t-email', 'me@example.com')
    renderApp()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})
