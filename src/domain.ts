export type Category = { id: number; slug: string; name: string; count?: number }
export type RadioFields = {
  name: string; categoryId: number; country: string; region: string; city?: string; description: string
  streamUrl: string; websiteUrl: string; appDownloadUrl: string
}
export type Radio = Omit<RadioFields, 'categoryId'> & {
  id: number; slug: string; category: Category; approvedUpdatedAt: string; visitCount?: number
  image: { url: string; width: number; height: number; alt: string }
}
export type Status = 'pending' | 'approved' | 'rejected' | 'archived'
export type OwnRadio = {
  id: number; slug: string; status: Status; revisionStatus: 'pending' | 'approved' | 'rejected';
  removalStatus?: 'pending' | 'approved' | 'rejected' | null; categorySuggestion?: { id: string; name: string } | null;
  version: number; revisionId: number; submittedAt: string; reason: string; categoryName: string; imagePath?: string; draft: RadioFields;
  history: { id: number; status: Status; decidedAt: string; reason: string }[]
}
export type Session = {
  authenticated: boolean; csrf: string; nonce?: string; registration: boolean;
  user?: { id: number; name: string; canSubmit: boolean }
}
export type Page = { items: Radio[]; page: number; perPage: number; total: number; totalPages: number }
export type Terms = { version: string; content: string; html?: string } | null
export const statusLabel: Record<Status, string> = {
  pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', archived: 'Arquivada',
}
export const radioPath = (slug: string) => '/radio/' + slug + '/'
export const locationLabel = (radio: Pick<RadioFields, 'city' | 'region' | 'country'>) =>
  [radio.city, radio.region, radio.country].filter(Boolean).join(', ')
