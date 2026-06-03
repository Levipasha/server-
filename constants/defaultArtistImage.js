/** Default profile image for new / bulk-created artist accounts */
const DEFAULT_ARTIST_AVATAR_URL = 'https://ui-avatars.com/api/?name=Artist&background=dc2626&color=fff&size=128&bold=true';

const getDefaultArtistImage = (alt = 'ArtArtist') => {
  const name = String(alt || 'ArtArtist').trim();
  const encodedName = encodeURIComponent(name);
  return {
    url: `https://ui-avatars.com/api/?name=${encodedName}&background=dc2626&color=fff&size=128&bold=true`,
    alt: name,
    publicId: null,
  };
};

module.exports = { DEFAULT_ARTIST_AVATAR_URL, getDefaultArtistImage };
