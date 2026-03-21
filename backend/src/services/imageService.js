function createPlaceholderImage(pageNumber, bookName) {
  const text = encodeURIComponent(`${bookName} - page ${pageNumber}`);
  return `https://placehold.co/900x1200/efe8d8/3e2f1b?text=${text}`;
}

function getStoryPageImage({ book, pageNumber }) {
  return {
    kind: "url",
    image: createPlaceholderImage(pageNumber, book.name)
  };
}

module.exports = {
  getStoryPageImage
};
