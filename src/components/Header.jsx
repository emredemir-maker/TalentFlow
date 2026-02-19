// src/components/Header.jsx
// Sticky header with search and actions

import { Search, Bell, Plus } from 'lucide-react';
import SystemScanner from './SystemScanner';

export default function Header({ title, searchQuery, onSearchChange, onSeedClick, seeding, showSeed }) {


    return (
        <header className="sticky top-0 z-40 px-6 lg:px-8 h-16 flex items-center justify-between gap-4 border-b border-white/[0.06] bg-navy-900/80 backdrop-blur-xl">
            {/* Title */}
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white to-navy-300 bg-clip-text text-transparent shrink-0">
                {title}
            </h1>

            {/* Search + Actions */}
            <div className="flex items-center gap-3">
                {/* Search */}
                {onSearchChange && (
                    <div className="relative hidden sm:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Aday, pozisyon, yetenek ara..."
                            value={searchQuery || ''}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-64 lg:w-80 pl-10 pr-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-navy-200 placeholder:text-navy-500 outline-none focus:border-electric/40 focus:ring-2 focus:ring-electric/10 transition-all"
                            id="search-input"
                        />
                    </div>
                )}


                <SystemScanner />

                {/* Notification */}
                <button className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-navy-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer relative">
                    <Bell className="w-4 h-4" />
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-electric animate-pulse" />
                </button>

            </div>
        </header>
    );
}
