import { useTranslation } from 'react-i18next';
export function App() { const { t } = useTranslation(); console.debug('HTTP'); return <main><h1 data-i18n-key="home.welcome">{t('home.welcome')}</h1><button data-i18n-key="home.save">{t('home.save')}</button></main>; }
