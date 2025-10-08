import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Auth from "./Auth";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // This component now serves as the auth page
    // The Auth component will handle redirects
  }, [navigate]);

  return <Auth />;
};

export default Index;
