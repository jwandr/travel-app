import Link from 'next/link';

export default function Home() {
  return (
    <div className="p-6">
      <h1 className="text-xl mb-4">Travel App</h1>
      <Link href="/login" className="text-blue-600">
        Go to Login
      </Link>
    </div>
  );
}