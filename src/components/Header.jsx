// src/components/Header.jsx
import React from 'react';
import { Search, Bell, Settings } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

export default function Header() {
    const { unreadCount } = useNotifications();
    const { userProfile } = useAuth();

    return (
        <header className="h-[88px] flex items-center justify-between px-8 bg-white/80 backdrop-blur-md border-b border-[#F1F5F9] sticky top-0 z-40">
            {/* Search Bar */}
            <div className="flex-1 max-w-[480px]">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8] group-focus-within:text-[#2563EB] transition-colors" />
                    <input
                        type="text"
                        placeholder="Search candidates, skills, or roles..."
                        className="w-full pl-12 pr-4 py-2.5 bg-[#F1F5F9] rounded-lg focus:bg-white focus:ring-1 focus:ring-[#2563EB] outline-none transition-all text-[14px] text-[#0F172A] placeholder:text-[#94A3B8]"
                    />
                </div>
            </div>

            {/* Actions & Profile Meta */}
            <div className="flex items-center gap-8">
                <div className="flex items-center gap-5">
                    <button className="text-[#64748B] hover:text-[#0F172A] transition-colors relative">
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#EF4444] rounded-full border-2 border-white" />
                        )}
                    </button>
                    <button className="text-[#64748B] hover:text-[#0F172A] transition-colors">
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex items-center gap-4 pl-8 border-l border-[#E2E8F0] tracking-tight">
                    <div className="text-right">
                        <div className="text-[14px] font-bold text-[#0F172A] leading-none">Senior Recruiter</div>
                        <div className="text-[11px] text-[#64748B] font-medium mt-1">Workspace: Tech Talent</div>
                    </div>
                </div>
            </div>
        </header>
    );
}
