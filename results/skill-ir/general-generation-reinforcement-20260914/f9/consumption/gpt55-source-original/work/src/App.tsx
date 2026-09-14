import { useTranslation } from 'react-i18next';
import './i18n';

export function App() {
  console.debug('HTTP');
  const { t } = useTranslation();
  return <main><h1 data-i18n-key="home.welcome">{t('home.welcome')}</h1><button data-i18n-key="home.save">{t('home.save')}</button></main>;
}
