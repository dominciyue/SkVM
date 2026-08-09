export function App({ name }: { name: string }) {
  return <section><p data-i18n-key="profile.greeting">你好，{name}</p><a href="https://example.test">API</a><button data-i18n-key="profile.logout">退出登录</button></section>;
}
