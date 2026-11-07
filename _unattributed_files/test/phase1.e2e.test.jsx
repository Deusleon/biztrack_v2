// End-to-end check of the new frontend against the REAL backend and a database upgraded from BizTrack's own data.
// Run it with the backend up:   VITE_API_BASE_URL=http://localhost:5055/api npx vitest run
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ToastProvider } from '../contexts/ToastContext';
import { t } from '../utils/i18n';

const EMAIL = process.env.E2E_EMAIL || 'deusleon7@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Test1234!';
const STORE_WITH_DATA = process.env.E2E_STORE_NAME || 'New Shop';
const pathNow = () => window.location.pathname;

const mount = (path) => { window.history.pushState({}, '', path); return render(<ToastProvider><App /></ToastProvider>); };

async function signIn(user) {
  await user.type(screen.getByPlaceholderText(t('enter_email', 'en')), EMAIL);
  await user.type(screen.getByPlaceholderText(t('enter_password', 'en')), PASSWORD);
  await user.click(screen.getByRole('button', { name: t('login', 'en') }));
  await waitFor(() => expect(pathNow()).toBe('/dashboard'), { timeout: 15000 });
}

describe('phase 1 — sign in, store switch, product categories', () => {
  beforeAll(() => { localStorage.setItem('lang', 'en'); });

  it('rejects a wrong password with the server\'s message and stays on the login page', async () => {
    const user = userEvent.setup();
    mount('/login');
    await user.type(screen.getByPlaceholderText(t('enter_email', 'en')), EMAIL);
    await user.type(screen.getByPlaceholderText(t('enter_password', 'en')), 'definitely-wrong-1!');
    await user.click(screen.getByRole('button', { name: t('login', 'en') }));
    await waitFor(() => expect(screen.getByText(/invalid credentials|attempt/i)).toBeInTheDocument(), { timeout: 15000 });
    expect(pathNow()).toBe('/login');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('signs in, switches store, and runs the full category cycle: list → add → edit → delete', async () => {
    const user = userEvent.setup();
    mount('/login');
    await signIn(user);

    // ── store switch ────────────────────────────────────────────────────────────────────────────
    const picker = await screen.findByTitle(t('switch_store'), {}, { timeout: 15000 });
    await user.click(within(picker).getByRole('button'));
    await user.click(await screen.findByText(STORE_WITH_DATA));
    await waitFor(() => expect(localStorage.getItem('currentStoreName')).toBe(STORE_WITH_DATA), { timeout: 15000 });

    // the menu now shows what this person may open in THAT store
    const link = await screen.findByRole('link', { name: t('product_categories') }, { timeout: 15000 });
    await user.click(link);
    await waitFor(() => expect(pathNow()).toBe('/categories/products'));

    // ── list ────────────────────────────────────────────────────────────────────────────────────
    await screen.findByRole('heading', { name: t('product_categories') });
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(5), { timeout: 15000 });
    const before = document.querySelectorAll('tbody tr').length;

    // ── add ─────────────────────────────────────────────────────────────────────────────────────
    const name = `E2E Category ${Date.now()}`;
    await user.click(screen.getByRole('button', { name: t('new_category') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByPlaceholderText(t('enter_category_name')), name);
    await user.click(within(dialog).getByRole('button', { name: t('save') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 15000 });
    // the list was loaded again from the server and now holds the new row
    await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument(), { timeout: 15000 });

    // ── search narrows the list on the server ───────────────────────────────────────────────────
    await user.type(screen.getByPlaceholderText(t('search')), name);
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(1), { timeout: 15000 });

    // ── edit ────────────────────────────────────────────────────────────────────────────────────
    const row = screen.getByText(name).closest('tr');
    await user.click(within(row).getAllByRole('button').at(-1));          // the ⋮ menu
    await user.click(await screen.findByText(t('edit')));
    const editDialog = await screen.findByRole('dialog');
    const nameBox = within(editDialog).getByPlaceholderText(t('enter_category_name'));
    expect(nameBox).toHaveValue(name);                                     // the form opened with the row's own values
    await user.clear(nameBox);
    await user.type(nameBox, `${name} v2`);
    await user.click(within(editDialog).getByRole('button', { name: t('update') }));
    await waitFor(() => expect(screen.getByText(`${name} v2`)).toBeInTheDocument(), { timeout: 15000 });

    // ── delete ──────────────────────────────────────────────────────────────────────────────────
    const row2 = screen.getByText(`${name} v2`).closest('tr');
    await user.click(within(row2).getAllByRole('button').at(-1));
    await user.click(await screen.findByText(t('delete')));
    await user.click(await screen.findByRole('button', { name: t('proceed') }));
    await waitFor(() => expect(screen.queryByText(`${name} v2`)).not.toBeInTheDocument(), { timeout: 15000 });

    // and it really is gone on the server: clear the search and count again
    await user.clear(screen.getByPlaceholderText(t('search')));
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(before), { timeout: 15000 });
  });
});
