export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200">
      <div className="container mx-auto px-4 py-4">
        <div className="text-center text-sm text-gray-600">
          Built with ❤️ by{' '}
          <a
            href="https://www.linkedin.com/in/dyogendrarao/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Yogendra Rao
          </a>
          <p className="mt-1 text-xs text-gray-500">
            © {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
} 