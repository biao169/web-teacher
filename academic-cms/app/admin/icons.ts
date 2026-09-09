import type { Component } from 'vue'
import { BadgeCheck, BookOpen, DatabaseBackup, FileText, FlaskConical, FolderKanban, Globe2, GraduationCap, Images, Languages, LayoutDashboard, LibraryBig, ListTree, MessageSquare, Newspaper, ScrollText, Settings, ShieldCheck, Users } from '@lucide/vue'
import type { AdminIconName } from '~~/shared/admin/registry'
export const ADMIN_ICONS: Readonly<Record<AdminIconName, Component>> = Object.freeze({
  dashboard: LayoutDashboard, site: Globe2, settings: Settings, navigation: ListTree, profiles: Users,
  research: FlaskConical, students: GraduationCap, publications: BookOpen, projects: FolderKanban,
  patents: BadgeCheck, news: Newspaper, courses: LibraryBig, messages: MessageSquare, media: Images,
  translation: Languages, auth: ShieldCheck, logs: ScrollText, backup: DatabaseBackup,
})
export const FALLBACK_ADMIN_ICON: Component = FileText
