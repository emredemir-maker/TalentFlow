// src/components/LoadingScreen.jsx
import TalentInnLogo from './TalentInnLogo';

/** Açılış ekranı: Clyro'nun sade, açık zemini; yalnız logo ve kısa bir durum satırı. */
export default function LoadingScreen({ message = 'Clyro Talent Başlatılıyor...', subtext = '' }) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-[#FAFBFA]">
            <div className="animate-pulse">
                <TalentInnLogo iconSize={64} textSize="34px" horizontal={false} />
            </div>

            <div className="flex flex-col items-center gap-1.5">
                <p className="text-sm font-medium text-[#4C524F]">{message}</p>
                {subtext && <p className="text-xs text-[#7A817D]">{subtext}</p>}
            </div>

            <div className="w-48 h-1 bg-[#E3E7E5] rounded-full overflow-hidden relative">
                <div className="absolute top-0 left-0 h-full w-full bg-[#14B8A6] animate-[loading-shimmer_2s_infinite]" />
            </div>
        </div>
    );
}
