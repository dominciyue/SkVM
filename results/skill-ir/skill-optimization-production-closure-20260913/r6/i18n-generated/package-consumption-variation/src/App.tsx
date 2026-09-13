import { useTranslation } from 'react-i18next';

export function Checkout({ count }: { count: number }) {
  const { t } = useTranslation();

  return (
    <section>
      <h2 data-i18n-key="cart.title">{t('cart.title')}</h2>
      <p data-i18n-key="cart.items">{t('cart.items', { count })}</p>
      <button data-i18n-key="cart.checkout">{t('cart.checkout')}</button>
    </section>
  );
}
