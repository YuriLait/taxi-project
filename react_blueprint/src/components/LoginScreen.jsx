import { useState } from 'react';
import { demoLogin } from '../lib/api.js';

const demoAccounts = [
  { login: 'admin', password: 'admin', label: 'Админ' },
  { login: 'dispatcher', password: 'dispatcher', label: 'Диспетчер' },
  { login: 'driver', password: 'driver', label: 'Водитель' }
];

export default function LoginScreen({ onLogin }) {
  const [login, setLogin] = useState('dispatcher');
  const [password, setPassword] = useState('dispatcher');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await demoLogin(login, password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function useDemo(account) {
    setLogin(account.login);
    setPassword(account.password);
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand">Такси Бонус</div>
        <h1>Вход в систему</h1>
        <p>Demo-авторизация для проверки ролей: админ, диспетчер, водитель.</p>
        {error ? <div className="error-box">{error}</div> : null}
        <label>Логин<input value={login} onChange={(e) => setLogin(e.target.value)} /></label>
        <label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="primary-btn" disabled={isLoading}>{isLoading ? 'Вхожу...' : 'Войти'}</button>
        <div className="demo-users">
          {demoAccounts.map((account) => <button type="button" key={account.login} className="secondary-btn" onClick={() => useDemo(account)}>{account.label}</button>)}
        </div>
      </form>
    </div>
  );
}
