import { useTranslation } from "react-i18next";
import "./i18n";

export function App({ name }: { name: string }) {
  const { t } = useTranslation();

  return <section><p data-i18n-key="profile.greeting">{t("profile.greeting", { name })}</p><a href="https://example.test">API</a><button data-i18n-key="profile.logout">{t("profile.logout")}</button></section>;
}
