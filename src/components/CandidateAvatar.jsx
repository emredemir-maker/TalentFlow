function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const SIZE_CLASSES = {
    sm:  'w-8  h-8  text-[11px]',
    md:  'w-10 h-10 text-[13px]',
    lg:  'w-11 h-11 text-[13px]',
    xl:  'w-20 h-20 text-3xl',
};

export default function CandidateAvatar({ name, photo, photoUrl, profileImage, size = 'md', rounded = 'rounded-xl', className = '' }) {
    const photoSrc = photo || photoUrl || profileImage;
    const initials  = getInitials(name);

    return (
        <div className={`${SIZE_CLASSES[size]} ${rounded} bg-slate-100 border border-black/5 overflow-hidden shrink-0 flex items-center justify-center ${className}`}>
            {photoSrc ? (
                <img
                    src={photoSrc}
                    alt={name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex');
                    }}
                />
            ) : null}
            <span
                className="font-black text-slate-500 w-full h-full items-center justify-center"
                style={{ display: photoSrc ? 'none' : 'flex' }}
            >
                {initials}
            </span>
        </div>
    );
}
