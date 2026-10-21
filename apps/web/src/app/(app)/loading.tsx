import { Loading } from "@/components/ui";

// Se muestra al instante al cambiar de módulo mientras llega la página: el menú no espera al servidor.
export default function AppLoading() {
  return <Loading />;
}
