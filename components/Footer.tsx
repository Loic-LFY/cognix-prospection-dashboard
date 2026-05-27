export default function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="max-w-screen-xl mx-auto px-4 py-4 flex items-center justify-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Developed with{' '}
          <span className="text-red-400" aria-label="amour">
            ❤️
          </span>{' '}
          by{' '}
          <a
            href="https://7solutionsweb.com?utm_source=website&utm_medium=footer+&utm_campaign=outil+cognix+leads"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 font-medium transition-colors"
          >
            7 Solutions Web
          </a>
        </p>
      </div>
    </footer>
  );
}
