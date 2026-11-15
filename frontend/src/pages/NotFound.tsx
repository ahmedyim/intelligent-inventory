import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <p className="text-8xl font-bold tracking-tight text-foreground">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-foreground">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Sorry, the page you are looking for doesn't exist or has been moved.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go back
        </Button>
        <Button asChild>
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Home
          </Link>
        </Button>
      </div>
    </div>
  );
}