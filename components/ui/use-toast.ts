// -------------------------------------------
// Implémentation simplifiée d'un toast (shadcn-like) pour feedback utilisateur
// -------------------------------------------
export type ToastVariant = 'default' | 'destructive';

type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

// -------------------------------------------
// Hook factice retournant l'API toast (compatible avec un éventuel futur provider)
// -------------------------------------------
export const useToast = () => ({ toast });

// -------------------------------------------
// Fonction toast : utilise alert côté client comme fallback visuel
// -------------------------------------------
export function toast(options: ToastOptions) {
  // -------------------------------------------
  // Affiche dans la console pour debug et utilise alert pour signaler l'action
  // -------------------------------------------
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-alert
    alert(`${options.title}\n${options.description ?? ''}`);
  }
  console.log('[toast]', options);
}
