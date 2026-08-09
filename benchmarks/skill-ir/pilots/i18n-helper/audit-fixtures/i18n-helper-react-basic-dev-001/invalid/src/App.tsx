import { useTranslation } from 'react-i18next';
export function App() { const { t } = useTranslation(); return <p data-i18n-key="home.welcome">残留文本 {t('wrong.key', { user: value })}</p>; }
